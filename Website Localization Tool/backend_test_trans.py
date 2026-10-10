import sys
sys.path.insert(0, '.')
from app.services.translation import TranslationService

ts = TranslationService()
print("Hindi 'Quotes to Scrape':", ts._mock_translate("Quotes to Scrape", "hi"))
print("Spanish 'Hello World':", ts._mock_translate("Hello World", "es"))
print("Japanese 'Hello':", ts._mock_translate("Hello", "ja"))
print("French 'Hello World':", ts._mock_translate("Hello World", "fr"))
print("German 'Welcome':", ts._mock_translate("Welcome", "de"))
print("Hindi 'Hello World Welcome':", ts._mock_translate("Hello World Welcome", "hi"))
print("Unknown lang 'en':", ts._mock_translate("Hello", "xx"))
