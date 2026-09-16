export function formatTrialDaysRemaining(days: number, locale: string): string {
  if (locale !== 'ar') {
    return `${days} day${days === 1 ? '' : 's'} remaining in your free trial`;
  }

  if (days === 1) return 'متبقي يوم واحد على انتهاء الفترة التجريبية';
  if (days === 2) return 'متبقي يومان على انتهاء الفترة التجريبية';
  if (days >= 3 && days <= 10) return `متبقي ${days} أيام على انتهاء الفترة التجريبية`;
  return `متبقي ${days} يومًا على انتهاء الفترة التجريبية`;
}

export function remainingDaysUnit(days: number, locale: string): string {
  if (locale !== 'ar') return days === 1 ? 'day left' : 'days left';
  if (days === 1) return 'يوم واحد متبقٍ';
  if (days === 2) return 'يومان متبقيان';
  if (days >= 3 && days <= 10) return 'أيام متبقية';
  return 'يومًا متبقيًا';
}
