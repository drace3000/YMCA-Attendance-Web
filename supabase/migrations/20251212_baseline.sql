


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."check_email_exists"("p_email" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from auth.users u
    where lower(u.email) = lower(trim(p_email))
  );
$$;


ALTER FUNCTION "public"."check_email_exists"("p_email" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."claim_instructor"("p_branch_id" "uuid", "p_nickname" "text", "p_first_name" "text" DEFAULT NULL::"text", "p_last_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_id uuid;
  v_auth uuid := auth.uid();
begin
  if v_auth is null then
    raise exception 'Not authenticated';
  end if;

  select id into v_id
  from public.instructors
  where branch_id = p_branch_id
    and nickname = p_nickname
  limit 1;

  if v_id is null then
    raise exception 'Instructor not found for branch/nickname';
  end if;

  if exists (
    select 1 from public.instructors
    where id = v_id
      and auth_user_id is not null
      and auth_user_id <> v_auth
  ) then
    raise exception 'Nickname already claimed by another user';
  end if;

  update public.instructors
  set auth_user_id = coalesce(auth_user_id, v_auth),
      first_name = coalesce(p_first_name, first_name),
      last_name  = coalesce(p_last_name,  last_name),
      raw_name   = coalesce(raw_name, p_nickname),
      branch_id  = coalesce(branch_id, p_branch_id)
  where id = v_id;

  return v_id;
end;
$$;


ALTER FUNCTION "public"."claim_instructor"("p_branch_id" "uuid", "p_nickname" "text", "p_first_name" "text", "p_last_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."email_in_branch"("p_email" "text", "p_branch_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from instructors i
    join auth.users u on u.id = i.auth_user_id
    where (
      i.branch_id = p_branch_id
      OR exists (
        select 1
        from public.instructor_branches ib
        where ib.instructor_id = i.id
          and ib.branch_id = p_branch_id
      )
    )
      and lower(u.email) = lower(p_email)
  );
$$;


ALTER FUNCTION "public"."email_in_branch"("p_email" "text", "p_branch_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nickname_exists"("p_branch_id" "uuid", "p_nickname" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.instructors i
    where (
      i.branch_id = p_branch_id
      OR exists (
        select 1
        from public.instructor_branches ib
        where ib.instructor_id = i.id
          and ib.branch_id = p_branch_id
      )
    )
    and upper(coalesce(i.nickname, '')) = upper(trim(p_nickname))
  );
$$;


ALTER FUNCTION "public"."nickname_exists"("p_branch_id" "uuid", "p_nickname" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."nickname_login_email"("p_branch_id" "uuid", "p_nickname" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_email text;
begin
  select u.email
  into v_email
  from public.instructors i
  join auth.users u on u.id = i.auth_user_id
  where (
    i.branch_id = p_branch_id
    OR exists (
      select 1
      from public.instructor_branches ib
      where ib.instructor_id = i.id
        and ib.branch_id = p_branch_id
    )
  )
    and i.nickname ilike p_nickname
  limit 1;
  return v_email;
end;
$$;


ALTER FUNCTION "public"."nickname_login_email"("p_branch_id" "uuid", "p_nickname" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_last_login"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$
  update public.instructors
  set last_login_at = now()
  where id = auth.uid();
$$;


ALTER FUNCTION "public"."update_last_login"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."Notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "notification" "text" NOT NULL,
    "image" "bytea",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "image_bytes" "bytea",
    "header" "text"
);


ALTER TABLE "public"."Notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."Notifications" IS 'Stores notification records with title, notification text, and optional image reference';



COMMENT ON COLUMN "public"."Notifications"."image" IS 'Binary content of notification image (PNG, etc.).';



COMMENT ON COLUMN "public"."Notifications"."image_bytes" IS 'Binary content for notification image (e.g., PNG bytes).';



CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text",
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "address" "text",
    "city" "text",
    "state" "text",
    "zip" "text",
    "phone" "text",
    "description" "text"
);


ALTER TABLE "public"."branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."class_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "class_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "day_of_week" "text" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "effective_month" "date" DEFAULT '2025-09-01'::"date" NOT NULL,
    "original_time_text" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "schedule_id" "uuid" NOT NULL,
    "headcount" integer,
    "headcount_submitted_at" timestamp with time zone,
    "headcount_updated_at" timestamp with time zone,
    "manager_approved" boolean,
    "manager_approved_at" timestamp with time zone,
    CONSTRAINT "class_sessions_time_order" CHECK (("end_time" > "start_time"))
);


ALTER TABLE "public"."class_sessions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "category" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instructor_branches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instructor_id" "uuid" NOT NULL,
    "branch_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."instructor_branches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."instructors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text",
    "last_name" "text",
    "nickname" "text",
    "pin" smallint,
    "raw_name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "branch_id" "uuid",
    "last_login_at" timestamp with time zone,
    "auth_user_id" "uuid",
    CONSTRAINT "instructors_pin_check" CHECK ((("pin" IS NULL) OR (("pin" >= 0) AND ("pin" <= 9999))))
);


ALTER TABLE "public"."instructors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."schedules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "month_start" "date" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "cloned_from_id" "uuid",
    "published_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "schedules_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text"])))
);


ALTER TABLE "public"."schedules" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."session_instructors" (
    "session_id" "uuid" NOT NULL,
    "instructor_id" "uuid" NOT NULL
);


ALTER TABLE "public"."session_instructors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."todos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."todos" OWNER TO "postgres";


ALTER TABLE ONLY "public"."Notifications"
    ADD CONSTRAINT "Notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."branches"
    ADD CONSTRAINT "branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instructor_branches"
    ADD CONSTRAINT "instructor_branches_instructor_id_branch_id_key" UNIQUE ("instructor_id", "branch_id");



ALTER TABLE ONLY "public"."instructor_branches"
    ADD CONSTRAINT "instructor_branches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."instructors"
    ADD CONSTRAINT "instructors_pin_unique" UNIQUE ("pin");



ALTER TABLE ONLY "public"."instructors"
    ADD CONSTRAINT "instructors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."locations"
    ADD CONSTRAINT "locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_month_start_unique" UNIQUE ("month_start");



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."session_instructors"
    ADD CONSTRAINT "session_instructors_pkey" PRIMARY KEY ("session_id", "instructor_id");



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_pkey" PRIMARY KEY ("id");



CREATE INDEX "branches_city_state_idx" ON "public"."branches" USING "btree" ("city", "state");



CREATE INDEX "class_sessions_day_start_idx" ON "public"."class_sessions" USING "btree" ("day_of_week", "start_time");



CREATE INDEX "class_sessions_location_idx" ON "public"."class_sessions" USING "btree" ("location_id");



CREATE INDEX "class_sessions_schedule_idx" ON "public"."class_sessions" USING "btree" ("schedule_id");



CREATE UNIQUE INDEX "class_sessions_uniq" ON "public"."class_sessions" USING "btree" ("schedule_id", "class_id", "location_id", "day_of_week", "start_time", "end_time");



CREATE INDEX "idx_notifications_created_at" ON "public"."Notifications" USING "btree" ("created_at" DESC);



CREATE INDEX "instructor_branches_branch_idx" ON "public"."instructor_branches" USING "btree" ("branch_id");



CREATE INDEX "instructor_branches_instructor_idx" ON "public"."instructor_branches" USING "btree" ("instructor_id");



CREATE UNIQUE INDEX "instructor_branches_primary_unique" ON "public"."instructor_branches" USING "btree" ("instructor_id") WHERE "is_primary";



CREATE UNIQUE INDEX "instructors_auth_user_id_unique" ON "public"."instructors" USING "btree" ("auth_user_id") WHERE ("auth_user_id" IS NOT NULL);



CREATE INDEX "instructors_branch_id_idx" ON "public"."instructors" USING "btree" ("branch_id");



CREATE UNIQUE INDEX "instructors_branch_nickname_unique" ON "public"."instructors" USING "btree" ("branch_id", "nickname") WHERE ("nickname" IS NOT NULL);



CREATE INDEX "todos_completed_idx" ON "public"."todos" USING "btree" ("completed");



CREATE INDEX "todos_user_id_idx" ON "public"."todos" USING "btree" ("user_id");



CREATE OR REPLACE TRIGGER "set_updated_at" BEFORE UPDATE ON "public"."todos" FOR EACH ROW EXECUTE FUNCTION "public"."handle_updated_at"();



ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."class_sessions"
    ADD CONSTRAINT "class_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "public"."schedules"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructor_branches"
    ADD CONSTRAINT "instructor_branches_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructor_branches"
    ADD CONSTRAINT "instructor_branches_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."instructors"
    ADD CONSTRAINT "instructors_branch_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."schedules"
    ADD CONSTRAINT "schedules_cloned_from_id_fkey" FOREIGN KEY ("cloned_from_id") REFERENCES "public"."schedules"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."session_instructors"
    ADD CONSTRAINT "session_instructors_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "public"."instructors"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."session_instructors"
    ADD CONSTRAINT "session_instructors_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."class_sessions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."todos"
    ADD CONSTRAINT "todos_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Users can delete own todos" ON "public"."todos" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can insert own todos" ON "public"."todos" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own todos" ON "public"."todos" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view own todos" ON "public"."todos" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."class_sessions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "instructor_can_read_own_sessions" ON "public"."class_sessions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."session_instructors" "si"
     JOIN "public"."instructors" "i" ON (("i"."id" = "si"."instructor_id")))
  WHERE (("si"."session_id" = "class_sessions"."id") AND ("i"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "instructor_can_read_self" ON "public"."instructors" FOR SELECT USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "auth_user_id")));



CREATE POLICY "instructor_can_read_session_links" ON "public"."session_instructors" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."instructors" "i"
  WHERE (("i"."id" = "session_instructors"."instructor_id") AND ("i"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "instructor_can_update_own_sessions" ON "public"."class_sessions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."session_instructors" "si"
     JOIN "public"."instructors" "i" ON (("i"."id" = "si"."instructor_id")))
  WHERE (("si"."session_id" = "class_sessions"."id") AND ("i"."auth_user_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."session_instructors" "si"
     JOIN "public"."instructors" "i" ON (("i"."id" = "si"."instructor_id")))
  WHERE (("si"."session_id" = "class_sessions"."id") AND ("i"."auth_user_id" = "auth"."uid"())))));



CREATE POLICY "instructor_can_update_self" ON "public"."instructors" FOR UPDATE USING ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "auth_user_id"))) WITH CHECK ((("auth"."uid"() IS NOT NULL) AND ("auth"."uid"() = "auth_user_id")));



ALTER TABLE "public"."instructors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."session_instructors" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."todos" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."check_email_exists"("p_email" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_email_exists"("p_email" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."check_email_exists"("p_email" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_email_exists"("p_email" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."claim_instructor"("p_branch_id" "uuid", "p_nickname" "text", "p_first_name" "text", "p_last_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_instructor"("p_branch_id" "uuid", "p_nickname" "text", "p_first_name" "text", "p_last_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."claim_instructor"("p_branch_id" "uuid", "p_nickname" "text", "p_first_name" "text", "p_last_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_instructor"("p_branch_id" "uuid", "p_nickname" "text", "p_first_name" "text", "p_last_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."email_in_branch"("p_email" "text", "p_branch_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."email_in_branch"("p_email" "text", "p_branch_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."email_in_branch"("p_email" "text", "p_branch_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."nickname_exists"("p_branch_id" "uuid", "p_nickname" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."nickname_exists"("p_branch_id" "uuid", "p_nickname" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."nickname_exists"("p_branch_id" "uuid", "p_nickname" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."nickname_login_email"("p_branch_id" "uuid", "p_nickname" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."nickname_login_email"("p_branch_id" "uuid", "p_nickname" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."nickname_login_email"("p_branch_id" "uuid", "p_nickname" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."nickname_login_email"("p_branch_id" "uuid", "p_nickname" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_last_login"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_last_login"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_last_login"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_last_login"() TO "service_role";


















GRANT ALL ON TABLE "public"."Notifications" TO "anon";
GRANT ALL ON TABLE "public"."Notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."Notifications" TO "service_role";



GRANT ALL ON TABLE "public"."branches" TO "anon";
GRANT ALL ON TABLE "public"."branches" TO "authenticated";
GRANT ALL ON TABLE "public"."branches" TO "service_role";



GRANT ALL ON TABLE "public"."class_sessions" TO "anon";
GRANT ALL ON TABLE "public"."class_sessions" TO "authenticated";
GRANT ALL ON TABLE "public"."class_sessions" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."instructor_branches" TO "anon";
GRANT ALL ON TABLE "public"."instructor_branches" TO "authenticated";
GRANT ALL ON TABLE "public"."instructor_branches" TO "service_role";



GRANT ALL ON TABLE "public"."instructors" TO "anon";
GRANT ALL ON TABLE "public"."instructors" TO "authenticated";
GRANT ALL ON TABLE "public"."instructors" TO "service_role";



GRANT ALL ON TABLE "public"."locations" TO "anon";
GRANT ALL ON TABLE "public"."locations" TO "authenticated";
GRANT ALL ON TABLE "public"."locations" TO "service_role";



GRANT ALL ON TABLE "public"."schedules" TO "anon";
GRANT ALL ON TABLE "public"."schedules" TO "authenticated";
GRANT ALL ON TABLE "public"."schedules" TO "service_role";



GRANT ALL ON TABLE "public"."session_instructors" TO "anon";
GRANT ALL ON TABLE "public"."session_instructors" TO "authenticated";
GRANT ALL ON TABLE "public"."session_instructors" TO "service_role";



GRANT ALL ON TABLE "public"."todos" TO "anon";
GRANT ALL ON TABLE "public"."todos" TO "authenticated";
GRANT ALL ON TABLE "public"."todos" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































