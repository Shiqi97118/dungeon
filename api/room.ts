import { handleRoom } from '../server/rooms.js'

export async function GET(request: Request) {
  return handleRoom(request)
}

export async function POST(request: Request) {
  return handleRoom(request)
}
