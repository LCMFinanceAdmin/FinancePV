-- Add group_name column for folder-style grouping on recurring page
ALTER TABLE recurring_pvs ADD COLUMN IF NOT EXISTS group_name TEXT DEFAULT 'General';

-- Set initial groups based on imported GAS templates
UPDATE recurring_pvs SET group_name = 'Utilities'   WHERE name IN ('PJ Bungalow Electricity','Unifi - 5th Floor');
UPDATE recurring_pvs SET group_name = 'Allowances'  WHERE name IN ('Staff Allowances','Monthly Allowance','Staff Allowance','Staff Allowance (Communicating Dept)','Staff Allowances (Transport + Handphone)','Bishop Allowances','Secretary Allowance','Housing Allowance','Contract Sum - Counselling','Handphone Allowance','Pastoral Allowances (Bukit Merah)','Jelapang LC Pastoral Allowance');
UPDATE recurring_pvs SET group_name = 'Allowances'  WHERE name LIKE 'Dean Allowance%';
UPDATE recurring_pvs SET group_name = 'COLA'        WHERE name = 'COLA';
UPDATE recurring_pvs SET group_name = 'LMB'         WHERE name LIKE 'LMB%';
UPDATE recurring_pvs SET group_name = 'Rentals'     WHERE name LIKE '%Rental%' OR name LIKE 'Shop Lot%';
UPDATE recurring_pvs SET group_name = 'Subsidies'   WHERE name LIKE 'Church Subsidy%';
UPDATE recurring_pvs SET group_name = 'Love Gift'   WHERE name IN ('LCMS Office Cleaning Allowance','Missionary Support - OMF (Lock Sai Kiew)','Love Gift & Rental - Myanmar Outreach (Ps. Richard)','Nepal Ministry Levy','Missionary Support - YFC (Rev. Lew Choo Hua)','STM Studies Support - Nantida','STM Studies Support - Norma','Love Gift - Sujan Khadka');
UPDATE recurring_pvs SET group_name = 'Rumah Ros'   WHERE name IN ('Monthly Subsidy to Rumah Ros','Touching Heart (6 Students) - Rumah Ros');
UPDATE recurring_pvs SET group_name = 'PCB'         WHERE name = 'PCB Monthly Contributions';
UPDATE recurring_pvs SET group_name = 'Car Loan'    WHERE name LIKE 'Car Loan%';
