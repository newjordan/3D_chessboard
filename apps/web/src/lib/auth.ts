import { NextAuthOptions } from "next-auth";
import GithubProvider from "next-auth/providers/github";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_ID || "",
      clientSecret: process.env.GITHUB_SECRET || "",
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async jwt({ token, profile }) {
      if (profile) {
        token.username = (profile as any).login;
        // Assign admin role if username matches
        if (token.username === process.env.ADMIN_GITHUB_USERNAME || token.username === 'jaymaart') {
          token.role = 'admin';
        } else {
          token.role = 'user';
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        (session.user as any).id = token.sub;
        (session.user as any).username = token.username;
        (session.user as any).role = token.role || 'user';
      }
      return session;
    },
  },
};
