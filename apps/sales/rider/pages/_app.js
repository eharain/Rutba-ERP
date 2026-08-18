import { useEffect } from "react";
import { AuthProvider } from "@rutba/shared/context/AuthContext";
import { UtilProvider } from "@rutba/shared/context/UtilContext";
import { AppContextEndpoints } from "@rutba/api-provider/endpoints";

AppContextEndpoints.setAppName('delivery');

import 'bootstrap/dist/css/bootstrap.min.css';
import '@rutba/shared/styles/layout.css';
import '../src/styles/globals.css';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    import("bootstrap/dist/js/bootstrap.bundle.min.js").catch(() => {});
  }, []);

  return (
    <AuthProvider>
      <UtilProvider>
        <Component {...pageProps} />
      </UtilProvider>
    </AuthProvider>
  );
}
