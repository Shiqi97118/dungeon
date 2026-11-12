import '../server/node.js'
import { handleProfile } from '../server/profile.js'

export async function GET(request: Request) {
  return handleProfile(request)
}

export async function POST(request: Request) {
  return handleProfile(request)
}
