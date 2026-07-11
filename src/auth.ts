import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

// Single-owner auth: there is exactly one account (you), defined entirely
// via env vars — no users table lookup needed for login. OWNER_PASSWORD_HASH
// is a bcrypt hash; generate one with:
//   node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Owner login",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const ownerEmail = process.env.OWNER_EMAIL;
        const ownerHash = process.env.OWNER_PASSWORD_HASH;

        if (!email || !password || !ownerEmail || !ownerHash) return null;
        if (email.toLowerCase() !== ownerEmail.toLowerCase()) return null;

        const valid = await bcrypt.compare(password, ownerHash);
        if (!valid) return null;

        return { id: "owner", email: ownerEmail, name: "Owner" };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
});
