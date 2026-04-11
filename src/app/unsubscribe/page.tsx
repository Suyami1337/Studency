import { Suspense } from 'react'

function UnsubscribeContent({ searchParams }: { searchParams: { [key: string]: string | undefined } }) {
  const email = searchParams.email
  return (
    <div className="max-w-md mx-auto mt-16 p-8 bg-white rounded-xl border border-gray-100">
      <div className="text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Вы отписаны</h1>
        <p className="text-sm text-gray-500">
          {email ? (
            <>Адрес <strong>{email}</strong> больше не будет получать письма.</>
          ) : (
            <>Вы успешно отписались от рассылки.</>
          )}
        </p>
        <p className="text-xs text-gray-400 mt-6">Studency</p>
      </div>
    </div>
  )
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>
}) {
  const params = await searchParams
  return (
    <Suspense fallback={<div>Загрузка…</div>}>
      <UnsubscribeContent searchParams={params} />
    </Suspense>
  )
}
