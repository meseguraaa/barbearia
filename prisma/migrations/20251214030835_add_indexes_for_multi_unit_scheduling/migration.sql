-- CreateIndex
CREATE INDEX "appointments_barberId_scheduleAt_idx" ON "appointments"("barberId", "scheduleAt");

-- CreateIndex
CREATE INDEX "barber_daily_availabilities_barberId_date_idx" ON "barber_daily_availabilities"("barberId", "date");

-- CreateIndex
CREATE INDEX "barber_units_barberId_idx" ON "barber_units"("barberId");

-- CreateIndex
CREATE INDEX "barber_weekly_availabilities_barberId_weekday_idx" ON "barber_weekly_availabilities"("barberId", "weekday");
