# rutba-helpdesk

Agent console for the Rutba helpdesk — the queue, ticket workspace, desk administration and
assignment-routing screens that support agents and desk managers work in day to day. It is a
Next.js pages-router app on **port 4019**, using the shared Rutba app shell (`BaseLayout`,
`Topbar`, `Sidebar`, `ProtectedRoute`) and the generated `@rutba/api-provider` clients. Its
backend is the Core-native helpdesk module at `rutba-core/src/modules/helpdesk.js`; the app
holds no business logic of its own and builds UI only for endpoints that module actually
serves.

Run it from the monorepo root so the shared env loader supplies the API URL and port:

```
npm run dev:helpdesk
```
