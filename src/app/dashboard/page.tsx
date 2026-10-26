export default function DashboardPage() {
    return (
        <div>
            <h1>Dashboard</h1>
            <form method="POST" action="/logout">
                <button type="submit">Logout</button>
            </form>
        </div>
    );
}