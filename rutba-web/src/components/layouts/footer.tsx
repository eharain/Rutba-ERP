import Link from "next/link";

export default function Footer() {
  return (
    <footer className="bg-slate-100 lg:grid lg:grid-cols-5">
      <div className="px-4 py-16 sm:px-6 lg:col-span-5 lg:px-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div>
            <p>
              <span className="text-xs uppercase tracking-wide text-gray-500">
                Call us
              </span>

              <a
                href="#"
                className="block text-2xl font-medium text-gray-900 hover:opacity-75 sm:text-3xl"
              >
                +923245303530
              </a>
            </p>

            <ul className="mt-8 space-y-1 text-sm text-gray-700">
            <li>Monday to Thursday: 11am - 9pm</li>
            <li>Friday: Closed</li>
            <li>Saturday and Sunday: 11am - 9pm</li>
            </ul>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <p className="font-medium text-gray-900">Link</p>

              <ul className="mt-6 space-y-4 text-sm">
                <li>
                  <Link
                    href="/product"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    Explore Products
                  </Link>
                </li>

                <li>
                  <Link
                    href="/login"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    Login
                  </Link>
                </li>

                <li>
                  <Link
                    href="/register"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    Register
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-gray-900">Social Media</p>

              <ul className="mt-6 space-y-4 text-sm">
                <li>
                  <a
                    href="https://www.facebook.com/profile.php?id=61587364924242"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    Facebook
                  </a>
                </li>

                <li>
                  <a
                    href="https://www.instagram.com/rutba.pakistan"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    Instagram
                  </a>
                </li>

                <li>
                  <a
                    href="https://www.tiktok.com/@rutbapk"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    TikTok
                  </a>
                </li>

                <li>
                  <a
                    href="https://www.youtube.com/@rutba-pk"
                    className="text-gray-700 transition hover:opacity-75"
                  >
                    Youtube
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-100 pt-12">
          <div className="sm:flex sm:items-center sm:justify-between">
            {/* <ul className="flex flex-wrap gap-4 text-xs">
              <li>
                <a
                  href="#"
                  className="text-gray-500 transition hover:opacity-75"
                >
                  Terms & Conditions
                </a>
              </li>

              <li>
                <a
                  href="#"
                  className="text-gray-500 transition hover:opacity-75"
                >
                  Privacy Policy
                </a>
              </li>

              <li>
                <a
                  href="#"
                  className="text-gray-500 transition hover:opacity-75"
                >
                  Cookies
                </a>
              </li>
            </ul> */}

            <p className="mt-8 text-xs text-gray-500 sm:mt-0">
              &copy; {new Date().getFullYear()}. Rutba.pk
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
