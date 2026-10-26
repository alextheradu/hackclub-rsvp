import {cookies} from 'next/headers'
import {redirect} from 'next/navigation'

export async function POST() {
    const store = await cookies()
    store.delete('session');
    redirect('/');
}