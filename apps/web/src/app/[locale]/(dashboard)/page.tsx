import { redirect } from 'next/navigation';

export default function RootDashboardPage({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/dashboard`);
}
