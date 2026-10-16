import unicodedata
import re

# IAST diacritic to ASCII mapping
IAST_MAP = {
    'ā': 'a', 'Ā': 'A',
    'ī': 'i', 'Ī': 'I',
    'ū': 'u', 'Ū': 'U',
    'ṛ': 'r', 'Ṛ': 'R',
    'ṝ': 'r', 'Ṝ': 'R',
    'ḷ': 'l', 'Ḷ': 'L',
    'ṣ': 's', 'Ṣ': 'S',
    'ś': 's', 'Ś': 'S',
    'ṭ': 't', 'Ṭ': 'T',
    'ḍ': 'd', 'Ḍ': 'D',
    'ṇ': 'n', 'Ṇ': 'N',
    'ṅ': 'n', 'Ṅ': 'N',
    'ñ': 'n', 'Ñ': 'N',
    'ṁ': 'm', 'Ṁ': 'M',
    'ṃ': 'm', 'Ṃ': 'M',
    'ḥ': 'h', 'Ḥ': 'H',
    'ḫ': 'h',
    'é': 'e', 'É': 'E',
    'ö': 'o', 'Ö': 'O',
    'ü': 'u', 'Ü': 'U',
}

def flatten(text: str) -> str:
    """Convert IAST/diacritic text to plain ASCII for fuzzy search matching."""
    if not text:
        return ''
    result = []
    for ch in text:
        if ch in IAST_MAP:
            result.append(IAST_MAP[ch])
        else:
            try:
                normalized = unicodedata.normalize('NFD', ch)
                ascii_ch = normalized.encode('ascii', 'ignore').decode('ascii')
                result.append(ascii_ch if ascii_ch else ch)
            except Exception:
                result.append(ch)
    return ''.join(result)

def normalize_query(query: str) -> str:
    """Normalize a search query: flatten diacritics and lowercase."""
    return flatten(query).lower().strip()
