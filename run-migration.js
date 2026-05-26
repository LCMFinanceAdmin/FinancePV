#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://osjbcgftckdhkdsulmhr.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zamJjZ2Z0Y2tkaGtkc3VsbWhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDI0MjA5MzEsImV4cCI6MjAxODAwMDkzMX0.jvVqnPj-J9uoHGWcZqUvLvPq4H7oAj4qL8hXL_ixMQI';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function runMigration() {
  try {
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', '006_budget_items.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    console.log('Running migration 006_budget_items.sql...');

    const { error, data } = await supabase.rpc('execute_sql', {
      sql: sql
    });

    if (error) {
      console.error('Migration error:', error);
      process.exit(1);
    }

    console.log('Migration completed successfully');
    console.log(data);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

runMigration();
