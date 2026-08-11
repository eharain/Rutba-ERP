import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';

/**
 * The app-wide unsaved-changes guard. Pass it a boolean and forget about it:
 * while `dirty` is true, closing/refreshing the tab raises the browser's
 * native "leave site?" prompt, and any in-app navigation (links, router
 * pushes, back/forward) asks for confirmation first — declined navigation is
 * aborted and the page keeps its state.
 *
 *   useUnsavedGuard(dirty);
 *   useUnsavedGuard(dirty, "The recipe has unsaved edits — leave anyway?");
 *
 * One hook, every app: any page with local edit state calls it with its own
 * dirty flag, and the whole suite behaves the same way. The flag rides a ref,
 * so a page may compute it per render without re-subscribing anything.
 *
 * Pages-router only (router.events); the browser prompt's wording is the
 * browser's own — the message shows in the in-app confirm.
 */
export default function useUnsavedGuard(dirty, message = 'You have unsaved changes — leave this page anyway?') {
    const router = useRouter();
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;

    useEffect(() => {
        const onBeforeUnload = (e) => {
            if (!dirtyRef.current) return undefined;
            e.preventDefault();
            // Chrome ignores the text but requires returnValue to prompt.
            e.returnValue = message;
            return message;
        };
        const onRouteChangeStart = () => {
            if (!dirtyRef.current) return;
            if (window.confirm(message)) return;
            router.events.emit('routeChangeError');
            // The pages-router convention: throwing from routeChangeStart
            // cancels the navigation. This is control flow, not a failure.
            // eslint-disable-next-line no-throw-literal
            throw 'Navigation aborted by useUnsavedGuard (not an error).';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        router.events.on('routeChangeStart', onRouteChangeStart);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
            router.events.off('routeChangeStart', onRouteChangeStart);
        };
    }, [router, message]);
}
