import unittest
from datetime import datetime, timezone

from paidsoon_worker.db import _claim_key


class ClaimKeyTests(unittest.TestCase):
    def test_reminder_email_claim_key_shape(self):
        scheduled_for = datetime(2026, 8, 3, 9, 0, tzinfo=timezone.utc)
        key = _claim_key("invoice_123", "reminder_email", scheduled_for)
        self.assertEqual(key, "invoice_123:reminder_email:2026-08-03")

    def test_claim_key_is_stable_within_the_same_day(self):
        morning = datetime(2026, 8, 3, 1, 0, tzinfo=timezone.utc)
        evening = datetime(2026, 8, 3, 23, 0, tzinfo=timezone.utc)
        self.assertEqual(
            _claim_key("invoice_123", "reminder_email", morning),
            _claim_key("invoice_123", "reminder_email", evening),
        )

    def test_claim_key_differs_across_days(self):
        day_one = datetime(2026, 8, 3, tzinfo=timezone.utc)
        day_two = datetime(2026, 8, 4, tzinfo=timezone.utc)
        self.assertNotEqual(
            _claim_key("invoice_123", "reminder_email", day_one),
            _claim_key("invoice_123", "reminder_email", day_two),
        )


if __name__ == "__main__":
    unittest.main()
