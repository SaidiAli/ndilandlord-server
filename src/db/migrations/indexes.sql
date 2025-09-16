-- Performance indexes for NDI Landlord database
-- Created: 2024-09-15
-- Purpose: Add proper indexes for ownership validation and query optimization

-- User-related indexes
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- Property ownership indexes
CREATE INDEX IF NOT EXISTS idx_properties_landlord ON properties(landlord_id);
CREATE INDEX IF NOT EXISTS idx_properties_active ON properties(landlord_id) WHERE landlord_id IS NOT NULL;

-- Unit availability and ownership indexes
CREATE INDEX IF NOT EXISTS idx_units_property ON units(property_id);
CREATE INDEX IF NOT EXISTS idx_units_available ON units(is_available);
CREATE INDEX IF NOT EXISTS idx_units_property_available ON units(property_id, is_available);
CREATE INDEX IF NOT EXISTS idx_units_property_number ON units(property_id, unit_number);

-- Lease management indexes
CREATE INDEX IF NOT EXISTS idx_leases_tenant ON leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_unit ON leases(unit_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status);
CREATE INDEX IF NOT EXISTS idx_leases_tenant_status ON leases(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leases_unit_status ON leases(unit_id, status);
CREATE INDEX IF NOT EXISTS idx_leases_dates ON leases(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leases_active_dates ON leases(start_date, end_date) WHERE status = 'active';

-- Payment tracking indexes
CREATE INDEX IF NOT EXISTS idx_payments_lease ON payments(lease_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_paid_date ON payments(paid_date);
CREATE INDEX IF NOT EXISTS idx_payments_lease_status ON payments(lease_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_pending_overdue ON payments(due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id) WHERE transaction_id IS NOT NULL;

-- Maintenance request indexes
CREATE INDEX IF NOT EXISTS idx_maintenance_unit ON maintenance_requests(unit_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tenant ON maintenance_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_status ON maintenance_requests(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_priority ON maintenance_requests(priority);
CREATE INDEX IF NOT EXISTS idx_maintenance_submitted ON maintenance_requests(submitted_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_unit_status ON maintenance_requests(unit_id, status);

-- Composite indexes for ownership validation queries
CREATE INDEX IF NOT EXISTS idx_ownership_landlord_property ON properties(landlord_id, id);
CREATE INDEX IF NOT EXISTS idx_ownership_property_unit ON units(property_id, id);
CREATE INDEX IF NOT EXISTS idx_ownership_unit_lease ON leases(unit_id, id, status);
CREATE INDEX IF NOT EXISTS idx_ownership_lease_payment ON payments(lease_id, id);
CREATE INDEX IF NOT EXISTS idx_ownership_unit_maintenance ON maintenance_requests(unit_id, id);

-- Complex ownership chain indexes for performance
CREATE INDEX IF NOT EXISTS idx_chain_landlord_tenant ON leases(tenant_id) 
  INCLUDE (unit_id) WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_chain_property_hierarchy ON units(property_id) 
  INCLUDE (id);

-- Time-based query optimization
CREATE INDEX IF NOT EXISTS idx_payments_monthly_reports ON payments(paid_date, status, amount) 
  WHERE status = 'completed' AND paid_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leases_expiring ON leases(end_date, status) 
  WHERE status = 'active' AND end_date > NOW();

-- Full-text search indexes (if needed for property/unit search)
CREATE INDEX IF NOT EXISTS idx_properties_search ON properties USING gin(to_tsvector('english', name || ' ' || address));
CREATE INDEX IF NOT EXISTS idx_units_search ON units USING gin(to_tsvector('english', unit_number || ' ' || COALESCE(description, '')));

-- Unique constraints for data integrity
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_property_unit_number ON units(property_id, unit_number);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_lease_per_unit ON leases(unit_id) WHERE status = 'active';

-- Partial indexes for common filtered queries
CREATE INDEX IF NOT EXISTS idx_active_tenants ON leases(tenant_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_available_units ON units(property_id, unit_number) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_overdue_payments ON payments(lease_id, due_date, amount) 
  WHERE status = 'pending' AND due_date < NOW();

-- Statistics and analytics indexes
CREATE INDEX IF NOT EXISTS idx_revenue_analytics ON payments(paid_date, amount) 
  WHERE status = 'completed' AND paid_date IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_occupancy_analytics ON leases(unit_id, start_date, end_date, status);

-- Add comments for documentation
COMMENT ON INDEX idx_ownership_landlord_property IS 'Optimizes landlord property ownership validation';
COMMENT ON INDEX idx_ownership_chain_tenant IS 'Supports tenant ownership chain queries';
COMMENT ON INDEX idx_payments_pending_overdue IS 'Accelerates overdue payment calculations';
COMMENT ON INDEX idx_unique_active_lease_per_unit IS 'Ensures only one active lease per unit';