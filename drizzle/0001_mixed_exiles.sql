ALTER TABLE "equipments" ADD COLUMN "parent_equipment_id" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sector_account" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "equipments" ADD CONSTRAINT "equipments_parent_equipment_id_equipments_id_fk" FOREIGN KEY ("parent_equipment_id") REFERENCES "public"."equipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_sector_account" ON "users" USING btree ("department_id") WHERE "users"."sector_account" = true;
--> statement-breakpoint
-- Preserve the oldest provisioned credential per sector, preferring TI administrators.
WITH selected AS (
  SELECT DISTINCT ON (department_id) id FROM users
  WHERE department_id IS NOT NULL AND password_hash IS NOT NULL AND active = true
  ORDER BY department_id, CASE WHEN role = 'admin_ti' THEN 0 ELSE 1 END, id
)
UPDATE users SET sector_account = true, onboarding_completed = true WHERE id IN (SELECT id FROM selected);
--> statement-breakpoint
CREATE FUNCTION validate_equipment_links() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_row equipments%ROWTYPE;
BEGIN
  IF NEW.parent_equipment_id IS NOT NULL THEN
    SELECT * INTO parent_row FROM equipments WHERE id = NEW.parent_equipment_id;
    IF NOT FOUND OR NEW.parent_equipment_id = NEW.id OR parent_row.equipment_type NOT IN ('Desktop', 'Notebook')
      OR NEW.equipment_type IN ('Desktop', 'Notebook') OR parent_row.department_id <> NEW.department_id THEN
      RAISE EXCEPTION 'Vinculo: equipamentos vinculados precisam de um desktop ou notebook do mesmo setor.' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM equipments WHERE parent_equipment_id = NEW.id AND (department_id <> NEW.department_id OR NEW.equipment_type NOT IN ('Desktop', 'Notebook'))) THEN
    RAISE EXCEPTION 'Vinculo: desvincule os perifericos antes de mudar o setor ou o tipo do computador.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER check_equipment_links BEFORE INSERT OR UPDATE ON equipments FOR EACH ROW EXECUTE FUNCTION validate_equipment_links();
