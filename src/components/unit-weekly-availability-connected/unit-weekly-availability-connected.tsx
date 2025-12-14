"use client";

import { useCallback } from "react";

import {
  UnitWeeklyAvailabilityForm,
  type UnitWeeklyAvailabilityDayPayload,
  type UnitWeeklyAvailabilityState,
} from "@/components/unit-weekly-availability-form/unit-weekly-availability-form";

import { saveUnitWeeklyAvailability } from "@/app/admin/settings/units/actions";

type Props = {
  unitId: string;
  initialValue: UnitWeeklyAvailabilityState;

  // ✅ novo: botão/modal pra ficar ao lado do salvar
  rightAction?: React.ReactNode;
};

export function UnitWeeklyAvailabilityConnected({
  unitId,
  initialValue,
  rightAction,
}: Props) {
  const onSave = useCallback(
    async (payload: { days: UnitWeeklyAvailabilityDayPayload[] }) => {
      await saveUnitWeeklyAvailability({
        unitId,
        days: payload.days,
      });
    },
    [unitId],
  );

  return (
    <UnitWeeklyAvailabilityForm
      initialValue={initialValue}
      showSaveButton={true}
      onSave={onSave}
      rightAction={rightAction}
    />
  );
}
