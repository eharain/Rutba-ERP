import { useEffect } from "react";
import { AuthProvider } from "@rutba/pos-shared/context/AuthContext";
import { UtilProvider } from "@rutba/pos-shared/context/UtilContext";
import { setAppName } from "@rutba/pos-shared/lib/api";

setAppName('rider');

import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '@rutba/pos-shared/styles/layout.css';
import '../src/styles/globals.css';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    import("bootstrap/dist/js/bootstrap.bundle.min.js");
  }, []);

  return (
    <AuthProvider>
      <UtilProvider>
        <Component {...pageProps} />
      </UtilProvider>
    </AuthProvider>
  );
}
