import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function LandingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: landing } = await supabase
    .from('landings')
    .select('html_content, status, name')
    .eq('slug', slug)
    .eq('status', 'published')
    .single()

  if (!landing || !landing.html_content) {
    notFound()
  }

  return (
    <html>
      <head>
        <title>{landing.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body dangerouslySetInnerHTML={{ __html: landing.html_content }} />
    </html>
  )
}
