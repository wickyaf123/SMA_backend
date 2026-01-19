# 🗄️ Supabase Database URLs Configuration

## ✅ What Changed

Your Prisma schema now uses **two database URLs** for optimal performance:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")      // Pooled connection (port 6543)
  directUrl = env("DIRECT_URL")        // Direct connection (port 5432)
}
```

---

## 📋 How to Get Your Supabase URLs

### Step 1: Go to Supabase Dashboard

1. Open [app.supabase.com](https://app.supabase.com)
2. Select your project
3. Go to **Project Settings** (gear icon) → **Database**
4. Scroll to **Connection string** section

### Step 2: Get Both URLs

You'll see different connection modes:

#### **Transaction Mode (Pooled)** → Use for `DATABASE_URL`
- **Port:** 6543
- **Used for:** Regular app queries
- **Format:** 
  ```
  postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:6543/postgres
  ```

#### **Session Mode (Direct)** → Use for `DIRECT_URL`
- **Port:** 5432
- **Used for:** Prisma migrations
- **Format:**
  ```
  postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-[region].pooler.supabase.com:5432/postgres
  ```

### Step 3: Important Notes

- **Replace `[YOUR-PASSWORD]`** with your actual database password
- **Add SSL mode:** Append `?sslmode=require` to `DIRECT_URL`
- **Add pgbouncer flag:** Append `?pgbouncer=true` to `DATABASE_URL`

---

## 🚂 Set These in Railway

Go to your Railway project → **Variables** tab → Add/Update:

```env
# Pooled connection for app runtime (port 6543)
DATABASE_URL=postgresql://postgres.xxxxx:[PASSWORD]@aws-0-region.pooler.supabase.com:6543/postgres?pgbouncer=true

# Direct connection for migrations (port 5432)
DIRECT_URL=postgresql://postgres.xxxxx:[PASSWORD]@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require
```

---

## 🔐 Finding Your Database Password

### Option 1: Use Existing Password
If you saved it when creating the project, use that.

### Option 2: Reset Password
If you don't have it:
1. Go to **Project Settings** → **Database**
2. Scroll to **Database Password**
3. Click **"Reset database password"**
4. **Save the new password immediately!**
5. Update both connection strings with the new password

---

## 📝 Example (with fake values)

```env
# ✅ CORRECT FORMAT
DATABASE_URL=postgresql://postgres.abcdefg123:MySecurePassword123@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.abcdefg123:MySecurePassword123@aws-0-us-west-1.pooler.supabase.com:5432/postgres?sslmode=require
```

**Key differences:**
- DATABASE_URL uses **6543** with **?pgbouncer=true**
- DIRECT_URL uses **5432** with **?sslmode=require**

---

## ✅ After Setting Variables in Railway

1. **Save** the variables
2. Railway will automatically **redeploy**
3. Check **Deployment logs** for:
   ```
   ✓ Prisma migrations deployed
   ✓ Database connected
   ✓ Server running on port 3000
   ```

---

## 🎯 Why This Fixes Your Issue

**Previous problem:**
- Prisma migrations over pooled connection (port 6543) can timeout or fail
- PgBouncer (connection pooler) doesn't support all migration operations

**Solution:**
- Migrations now use **direct connection** (port 5432) - reliable
- App runtime uses **pooled connection** (port 6543) - performant
- Best of both worlds! 🚀

---

## 🔍 Verify It's Working

After redeployment, check Railway logs for these success messages:

```
Environment: Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database
✓ Prisma Client generated
✓ Migrations deployed successfully
✓ Database connected
✓ Redis connected
🚀 Server running on port 3000
```

---

## ❓ Troubleshooting

| Issue | Solution |
|-------|----------|
| "DIRECT_URL is required" | Make sure both URLs are set in Railway Variables |
| "Invalid database URL" | Check password is correct in both URLs |
| "Connection refused" | Verify ports: 6543 for DATABASE_URL, 5432 for DIRECT_URL |
| "SSL required" | Add `?sslmode=require` to DIRECT_URL |

---

**Next:** Once both URLs are set in Railway, your deployment should succeed! ✅

