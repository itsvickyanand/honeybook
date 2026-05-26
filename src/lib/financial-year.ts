/**
 * Indian financial year helpers.
 * FY runs Apr–Mar; "2026-27" means Apr-2026 → Mar-2027.
 */
export function financialYearOf(date: Date): string {
  const y = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export function currentFinancialYear(): string {
  return financialYearOf(new Date());
}
