CREATE TABLE "asset_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipment_id" integer NOT NULL,
	"movement_type" text NOT NULL,
	"previous_status" text NOT NULL,
	"new_status" text NOT NULL,
	"from_department_id" integer,
	"to_department_id" integer,
	"collaborator_name" text NOT NULL,
	"collaborator_document" text NOT NULL,
	"collaborator_role" text NOT NULL,
	"collaborator_department" text NOT NULL,
	"reason" text NOT NULL,
	"condition_state" text NOT NULL,
	"accessories_included" text,
	"notes" text,
	"term_number" text,
	"performed_by_id" integer NOT NULL,
	"occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"department_id" integer NOT NULL,
	"incident_id" integer,
	"sender_id" integer NOT NULL,
	"message_type" text DEFAULT 'CHAT' NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"location" text NOT NULL,
	"cost_center" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "departments_name_unique" UNIQUE("name"),
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "equipments" (
	"id" serial PRIMARY KEY NOT NULL,
	"asset_tag" text NOT NULL,
	"serial_number" text NOT NULL,
	"equipment_type" text NOT NULL,
	"brand" text NOT NULL,
	"model" text NOT NULL,
	"department_id" integer NOT NULL,
	"responsible_company" text NOT NULL,
	"ownership_type" text NOT NULL,
	"contract_number" text,
	"supplier_name" text,
	"contract_end_date" text,
	"operational_status" text DEFAULT 'Disponível' NOT NULL,
	"current_holder_name" text,
	"current_holder_document" text,
	"current_holder_role" text,
	"manufacture_year" integer NOT NULL,
	"last_inspection_date" text,
	"next_inspection_date" text,
	"accessories" text,
	"notes" text,
	"connection_interface" text DEFAULT 'N/A' NOT NULL,
	"network_address" text,
	"port_number" integer,
	"connection_status" text DEFAULT 'Não Verificado' NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "equipments_asset_tag_unique" UNIQUE("asset_tag"),
	CONSTRAINT "equipments_serial_number_unique" UNIQUE("serial_number")
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_code" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" text DEFAULT 'Média' NOT NULL,
	"status" text DEFAULT 'Aberto' NOT NULL,
	"department_id" integer NOT NULL,
	"requester_id" integer NOT NULL,
	"assigned_technician_id" integer,
	"equipment_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "incidents_ticket_code_unique" UNIQUE("ticket_code")
);
--> statement-breakpoint
CREATE TABLE "inspections" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipment_id" integer NOT NULL,
	"movement_id" integer,
	"inspector_id" integer NOT NULL,
	"inspection_date" text NOT NULL,
	"next_inspection_date" text,
	"physical_condition" text NOT NULL,
	"checklist_json" jsonb NOT NULL,
	"findings" text,
	"approved_for_use" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "remote_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipment_id" integer NOT NULL,
	"technician_id" integer NOT NULL,
	"action_type" text NOT NULL,
	"connection_interface" text NOT NULL,
	"target_address" text,
	"result_status" text NOT NULL,
	"details" text NOT NULL,
	"latency_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"auth_version" integer DEFAULT 0 NOT NULL,
	"full_name" text NOT NULL,
	"matricula" text,
	"job_title" text,
	"role" text DEFAULT 'colaborador' NOT NULL,
	"department_id" integer,
	"onboarding_completed" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
ALTER TABLE "asset_movements" ADD CONSTRAINT "asset_movements_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_movements" ADD CONSTRAINT "asset_movements_from_department_id_departments_id_fk" FOREIGN KEY ("from_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_movements" ADD CONSTRAINT "asset_movements_to_department_id_departments_id_fk" FOREIGN KEY ("to_department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_movements" ADD CONSTRAINT "asset_movements_performed_by_id_users_id_fk" FOREIGN KEY ("performed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_technician_id_users_id_fk" FOREIGN KEY ("assigned_technician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_movement_id_asset_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."asset_movements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_sessions" ADD CONSTRAINT "remote_sessions_equipment_id_equipments_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remote_sessions" ADD CONSTRAINT "remote_sessions_technician_id_users_id_fk" FOREIGN KEY ("technician_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_movements_equipment" ON "asset_movements" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "idx_movements_occurred_at" ON "asset_movements" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "idx_chat_department" ON "chat_messages" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_chat_created_at" ON "chat_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_equipments_asset_tag" ON "equipments" USING btree ("asset_tag");--> statement-breakpoint
CREATE INDEX "idx_equipments_serial_number" ON "equipments" USING btree ("serial_number");--> statement-breakpoint
CREATE INDEX "idx_equipments_department" ON "equipments" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_equipments_status" ON "equipments" USING btree ("operational_status");--> statement-breakpoint
CREATE INDEX "idx_incidents_department" ON "incidents" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_incidents_status" ON "incidents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_inspections_equipment" ON "inspections" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "idx_remote_sessions_equipment" ON "remote_sessions" USING btree ("equipment_id");--> statement-breakpoint
CREATE INDEX "idx_users_department" ON "users" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_users_email_unique" ON "users" USING btree (lower("email"));