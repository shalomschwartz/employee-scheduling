export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/schedule/:path*",
    "/constraints/:path*",
    "/my-schedule/:path*",
    "/availability/:path*",
    "/onboarding/:path*",
    "/settings/:path*",
  ],
};
