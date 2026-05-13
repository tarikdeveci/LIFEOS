import type { Metadata } from 'next'
import BillingClient from './BillingClient'

export const metadata: Metadata = { title: 'Abonelik' }

export default function BillingPage() {
  return <BillingClient />
}
