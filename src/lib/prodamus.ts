// Prodamus integration
// Docs: https://help.prodamus.ru/payform
//
// Required env vars:
// - PRODAMUS_SHOP_ID (идентификатор магазина)
// - PRODAMUS_SECRET_KEY (секретный ключ для подписи)
// - PRODAMUS_BASE_URL (базовый URL формы оплаты, например https://your-shop.payform.ru)

import crypto from 'crypto'

export type ProdamusOrder = {
  orderId: string
  amount: number
  productName: string
  customerEmail?: string
  customerPhone?: string
  successUrl?: string
  callbackUrl?: string
}

function hmacSha256(data: string, key: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('hex')
}

/**
 * Build a payment link for Prodamus payform.
 * Returns a URL the user can follow to pay.
 */
export function createPaymentLink(order: ProdamusOrder): string {
  const baseUrl = process.env.PRODAMUS_BASE_URL
  const secretKey = process.env.PRODAMUS_SECRET_KEY

  if (!baseUrl || !secretKey) {
    throw new Error('PRODAMUS_BASE_URL and PRODAMUS_SECRET_KEY must be set')
  }

  const params: Record<string, string> = {
    order_id: order.orderId,
    products: JSON.stringify([{
      name: order.productName,
      price: String(order.amount),
      quantity: '1',
    }]),
    sum: String(order.amount),
    currency: 'rub',
  }

  if (order.customerEmail) params.customer_email = order.customerEmail
  if (order.customerPhone) params.customer_phone = order.customerPhone
  if (order.successUrl) params.urlSuccess = order.successUrl
  if (order.callbackUrl) params.urlNotification = order.callbackUrl

  // Sort params and build string for signature
  const sortedKeys = Object.keys(params).sort()
  const signatureString = sortedKeys.map(k => `${k}=${params[k]}`).join('&')
  const signature = hmacSha256(signatureString, secretKey)
  params.signature = signature

  const query = new URLSearchParams(params).toString()
  return `${baseUrl}?${query}`
}

/**
 * Verify webhook signature from Prodamus.
 * Call this in the webhook handler to ensure the request is authentic.
 */
export function verifyWebhookSignature(
  body: Record<string, string>,
  receivedSignature: string
): boolean {
  const secretKey = process.env.PRODAMUS_SECRET_KEY
  if (!secretKey) return false

  // Remove signature from body before computing
  const { signature, ...rest } = body
  void signature

  const sortedKeys = Object.keys(rest).sort()
  const signatureString = sortedKeys.map(k => `${k}=${rest[k]}`).join('&')
  const expected = hmacSha256(signatureString, secretKey)

  return expected === receivedSignature
}
