CREATE TABLE IF NOT EXISTS "cloud_saves" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"save_data" jsonb NOT NULL,
	"schema_version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"wave_reached" integer NOT NULL,
	"kills" integer NOT NULL,
	"gold" integer NOT NULL,
	"duration_sec" real NOT NULL,
	"weapon" text NOT NULL,
	"seed" integer NOT NULL,
	"run_report" jsonb,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cloud_saves" ADD CONSTRAINT "cloud_saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "runs" ADD CONSTRAINT "runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_wave_idx" ON "runs" USING btree ("wave_reached");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runs_weapon_wave_idx" ON "runs" USING btree ("weapon","wave_reached");