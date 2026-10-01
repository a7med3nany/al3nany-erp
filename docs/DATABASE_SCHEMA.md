# Firestore Database Schema

## Collections
1. **users:** `{id, name, role_id, status}`
2. **roles:** `{id, name, permissions: string[]}`
3. **warehouses:** `{id, name, location}`
4. **cashboxes:** `{id, name, type, current_balance}`
5. **product_groups:** `{id, name}`
6. **products:** `{id, sku, name, group_id, price1, price2, price3, price4, is_active}`
7. **inventory:** `{id: prodId_whId, product_id, warehouse_id, quantity, average_cost, updated_at}`
8. **customers / suppliers:** `{id, name, phone, current_balance, created_at}`
9. **sales_invoices / purchase_invoices:**
   - `{id, type, date, entity_id, warehouse_id, cashbox_id, subtotal, discount, additional_fees, total, paid, remaining, status, created_by}`
   - `items (Sub-collection): [{product_id, name_snapshot, quantity, unit_price, unit_cost_snapshot, line_profit}]`
10. **financial_transactions:** `{id, type, amount, cashbox_id, related_entity_id, reference_doc_id, date, created_by}`
11. **inventory_movements:** `{id, type, product_id, warehouse_id, quantity_change, cost_at_movement, reference_doc_id, date}`
12. **daily_closings:** `{id, date, closed_by, differences: [], transfer_amount, status}`
13. **participants:** `{id, name, is_active}`
14. **participant_agreements:** `{id, participant_id, cash_contribution, profit_share_pct, loss_share_pct, start_date, end_date, status}`
15. **audit_logs:** `{id, user_id, action, entity_type, entity_id, old_data, new_data, date, reason}`

## Required Composite Indexes
- `sales_invoices`: [date: DESC, warehouse_id: ASC]
- `sales_invoices`: [date: DESC, customer_id: ASC]
- `inventory_movements`: [product_id: ASC, warehouse_id: ASC, date: DESC]
- `financial_transactions`: [related_entity_id: ASC, date: DESC]
- `audit_logs`: [entity_id: ASC, date: DESC]
