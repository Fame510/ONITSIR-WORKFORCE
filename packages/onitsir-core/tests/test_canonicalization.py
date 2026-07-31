"""canonical_hash() determinism, including the non-ASCII case.

Cross-implementation agreement on parameter digests is what makes an argument
binding meaningful. Key order must not matter; encoding must be stable UTF-8.
The non-ASCII behaviour is deliberately pinned here because it is not covered
by any published conformance vector.
"""
import math

import pytest

from onitsir.shackle import canonical_hash


def test_key_order_does_not_change_the_digest():
    assert canonical_hash({"a": 1, "b": 2}) == canonical_hash({"b": 2, "a": 1})


def test_nested_key_order_does_not_change_the_digest():
    left = {"outer": {"z": 1, "a": [1, 2, {"q": 3, "p": 4}]}}
    right = {"outer": {"a": [1, 2, {"p": 4, "q": 3}]}, }
    right["outer"]["z"] = 1
    assert canonical_hash(left) == canonical_hash(right)


def test_list_order_does_change_the_digest():
    """Lists are ordered data, unlike dict keys. Reordering them must change
    the digest, otherwise argument binding would be forgeable."""
    assert canonical_hash({"a": [1, 2]}) != canonical_hash({"a": [2, 1]})


def test_empty_params_is_stable():
    assert canonical_hash({}) == canonical_hash({})
    assert len(canonical_hash({})) == 64


def test_digest_is_hex_sha256():
    digest = canonical_hash({"tool": "x"})
    assert len(digest) == 64
    assert all(c in "0123456789abcdef" for c in digest)


def test_non_ascii_values_hash_deterministically():
    """ensure_ascii=False means non-ASCII values are encoded as UTF-8 rather
    than escaped. This is correct, but untested by any published vector, so it
    is pinned here."""
    params = {"city": "Zürich", "note": "café ☕", "kanji": "日本語"}
    first = canonical_hash(params)
    second = canonical_hash(dict(reversed(list(params.items()))))
    assert first == second
    assert len(first) == 64


def test_non_ascii_differs_from_its_ascii_escaped_spelling():
    """A literal backslash-u sequence is a different value from the character
    it would escape to. If these ever collide, two different calls would share
    one argument digest."""
    assert canonical_hash({"v": "ü"}) != canonical_hash({"v": "\\u00fc"})


def test_non_ascii_keys_hash_deterministically():
    assert canonical_hash({"ключ": 1, "a": 2}) == canonical_hash({"a": 2, "ключ": 1})


def test_unicode_normalization_is_not_applied():
    """Documented property: canonicalization is byte-level, not Unicode-NFC.
    Composed and decomposed forms of the same grapheme produce different
    digests. Implementations that normalize would disagree with this one, so
    the behaviour is pinned rather than assumed."""
    composed = {"v": "\u00e9"}          # e-acute, single code point
    decomposed = {"v": "e\u0301"}       # e + combining acute
    assert canonical_hash(composed) != canonical_hash(decomposed)


def test_nan_is_rejected():
    """allow_nan=False. NaN has no canonical JSON form, so callers must treat
    it as malformed input rather than hashing it."""
    with pytest.raises(ValueError):
        canonical_hash({"v": math.nan})


def test_infinity_is_rejected():
    with pytest.raises(ValueError):
        canonical_hash({"v": math.inf})


def test_int_and_float_spellings_of_the_same_number_differ():
    """Documented property: JSON serializes 1 and 1.0 differently, so they do
    not share a digest. Callers normalizing numeric types must do so before
    hashing."""
    assert canonical_hash({"v": 1}) != canonical_hash({"v": 1.0})
