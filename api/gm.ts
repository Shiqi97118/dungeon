import { handleGm } from '../server/gmProxy.js'

export async function GET(request: Request) {
  return handleGm(request)
}

export async function POST(request: Request) {
  return handleGm(request)
}
