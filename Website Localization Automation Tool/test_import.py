import sys
sys.path.insert(0, 'backend')
try:
    from app.api.segments import TranslationService
    print("OK - TranslationService imported")
except Exception as e:
    print(f"IMPORT FAILED: {e}")