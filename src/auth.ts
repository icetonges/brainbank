import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

// Single-owner auth: there is exactly one account (you), defined entirely
// via env vars — no users table lookup needed for login. Two ways to set
// the password:
//   - OWNER_PASSWORD: plain text, simplest, checked first if set
//   - OWNER_PASSWORD_HASH: bcrypt hash, generate with
//       node -e "console.log(require('bcryptjs').hashSync('your-password', 10))"
// Only one is required; OWNER_PASSWORD takes priority if both are set.
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
        const ownerPassword = process.env.OWNER_PASSWORD;
        const ownerHash = process.env.OWNER_PASSWORD_HASH;

        if (!email || !password || !ownerEmail) return null;
        if (!ownerPassword && !ownerHash) return null;
        if (email.trim().toLowerCase() !== ownerEmail.trim().toLowerCase()) return null;

        const valid = ownerPassword
          ? password === ownerPassword
          : await bcrypt.compare(password, ownerHash as string);
        if (!valid) return null;

        return { id: "owner", email: ownerEmail, name: "Owner" };
      },
    }),
  ],
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
});
