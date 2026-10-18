CREATE INDEX "form_families_name_idx" ON "form_families" USING btree ("name");--> statement-breakpoint
CREATE INDEX "form_family_entries_family_idx" ON "form_family_entries" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "morphology_records_occurrence_idx" ON "morphology_records" USING btree ("occurrence_id");--> statement-breakpoint
CREATE INDEX "root_picture_terms_root_idx" ON "root_picture_terms" USING btree ("root_id");--> statement-breakpoint
CREATE INDEX "translations_scope_provider_idx" ON "translations" USING btree ("scope_type","scope_id","provider","version");--> statement-breakpoint
CREATE INDEX "word_occurrences_surah_idx" ON "word_occurrences" USING btree ("surah_id");--> statement-breakpoint
CREATE INDEX "word_occurrences_shared_teaching_idx" ON "word_occurrences" USING btree ("shared_teaching_id");--> statement-breakpoint
CREATE INDEX "word_occurrences_root_idx" ON "word_occurrences" USING btree ("root_id");
