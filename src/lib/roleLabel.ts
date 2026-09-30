/** Human-friendly role label for display. */
export const roleLabel = (role: string | undefined): string => {
  if (role === 'supervisor') return 'Supervisor'
  if (role === 'waiter') return 'Waiter'
  if (role === 'admin') return 'Admin'
  return role ?? ''
}