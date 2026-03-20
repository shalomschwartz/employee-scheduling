import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { Role } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login?error=1",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        isManager: { label: "Is Manager", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.username) return null;

        if (credentials.isManager === "true") {
          // Manager: look up by email, verify password
          const user = await prisma.user.findUnique({
            where: { email: credentials.username.toLowerCase() },
          });
          if (!user || user.role !== "MANAGER") return null;
          if (!credentials.password) return null;
          const valid = await bcrypt.compare(credentials.password, user.password);
          if (!valid) return null;
          return { id: user.id, name: user.name, email: user.email };
        } else {
          // Employee: look up by name, no password needed
          const user = await prisma.user.findFirst({
            where: { name: { equals: credentials.username, mode: "insensitive" }, role: "EMPLOYEE" },
          });
          if (!user) return null;
          return { id: user.id, name: user.name, email: user.email };
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { id: true, role: true, organizationId: true, isShiftLead: true },
        });
        if (dbUser) {
          token.id = dbUser.id;
          token.role = dbUser.role;
          token.organizationId = dbUser.organizationId;
          token.isShiftLead = dbUser.isShiftLead;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.organizationId = token.organizationId as string | null;
        session.user.isShiftLead = token.isShiftLead as boolean;
      }
      return session;
    },
  },
};
