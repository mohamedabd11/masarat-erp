import { Construction } from 'lucide-react';

export default function Page({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
      <div className="p-5 bg-amber-50 rounded-2xl">
        <Construction size={40} className="text-amber-500" />
      </div>
      <h1 className="text-2xl font-bold text-slate-900">
        {isAr ? 'الطيران' : 'Flights'}
      </h1>
      <p className="text-slate-500 max-w-sm">
        {isAr
          ? 'هذه الصفحة قيد التطوير وستكون متاحة قريباً'
          : 'This page is under development and will be available soon'}
      </p>
      <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
        {isAr ? 'قريباً' : 'Coming Soon'}
      </span>
    </div>
  );
}
