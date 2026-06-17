-- Drop the plaintext-password column. Passwords are bcrypt-hashed in User.password;
-- this column was a breach-amplification risk and is no longer written to.
ALTER TABLE "ClientRecord" DROP COLUMN "plainPassword";
