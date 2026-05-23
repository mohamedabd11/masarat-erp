import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { getLocales } from 'expo-localization';

const deviceLocale = getLocales()[0]?.languageCode ?? 'ar';

const ar = {
  common: {
    loading: 'جارٍ التحميل...',
    error: 'حدث خطأ',
    retry: 'إعادة المحاولة',
    save: 'حفظ',
    cancel: 'إلغاء',
    search: 'بحث',
    noData: 'لا توجد بيانات',
  },
  auth: {
    login: 'تسجيل الدخول',
    logout: 'تسجيل الخروج',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    loginButton: 'دخول',
    welcomeBack: 'مرحباً بعودتك',
    invalidCredentials: 'البريد أو كلمة المرور غير صحيحة',
  },
  nav: {
    dashboard: 'لوحة التحكم',
    bookings: 'الحجوزات',
    customers: 'العملاء',
    invoices: 'الفواتير',
    settings: 'الإعدادات',
  },
  bookings: {
    title: 'الحجوزات',
    newBooking: 'حجز جديد',
    noBookings: 'لا توجد حجوزات',
    statuses: {
      draft: 'مسودة',
      pending_approval: 'بانتظار الموافقة',
      confirmed: 'مؤكد',
      in_progress: 'قيد التنفيذ',
      completed: 'مكتمل',
      cancelled: 'ملغى',
    },
  },
};

const en: typeof ar = {
  common: {
    loading: 'Loading...',
    error: 'An error occurred',
    retry: 'Retry',
    save: 'Save',
    cancel: 'Cancel',
    search: 'Search',
    noData: 'No data',
  },
  auth: {
    login: 'Login',
    logout: 'Logout',
    email: 'Email',
    password: 'Password',
    loginButton: 'Sign In',
    welcomeBack: 'Welcome Back',
    invalidCredentials: 'Invalid email or password',
  },
  nav: {
    dashboard: 'Dashboard',
    bookings: 'Bookings',
    customers: 'Customers',
    invoices: 'Invoices',
    settings: 'Settings',
  },
  bookings: {
    title: 'Bookings',
    newBooking: 'New Booking',
    noBookings: 'No bookings yet',
    statuses: {
      draft: 'Draft',
      pending_approval: 'Pending Approval',
      confirmed: 'Confirmed',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled',
    },
  },
};

i18n.use(initReactI18next).init({
  resources: { ar: { translation: ar }, en: { translation: en } },
  lng: deviceLocale === 'ar' ? 'ar' : 'en',
  fallbackLng: 'ar',
  interpolation: { escapeValue: false },
});

export default i18n;
