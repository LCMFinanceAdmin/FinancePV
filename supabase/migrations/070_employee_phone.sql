-- Add WhatsApp/phone number to employees for direct sharing.
ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS phone_no TEXT NOT NULL DEFAULT '';
