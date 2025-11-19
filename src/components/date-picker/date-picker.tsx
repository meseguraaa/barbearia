'use client';

import {
    Calendar as CalendarIcon,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { addDays, format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { NavigationButton } from './navigation-button';

export const DatePicker = () => {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const dateParam = searchParams.get('date');

    const getInitialDate = useCallback(() => {
        if (!dateParam) return new Date();

        const [year, month, day] = dateParam.split('-').map(Number);
        const parsedDate = new Date(year, month - 1, day);

        return isValid(parsedDate) ? parsedDate : new Date();
    }, [dateParam]);

    const [date, setDate] = useState<Date>(() => getInitialDate());
    const [isPopoverOpen, setIsPopoverOpen] = useState(false);

    const updateURLWithDate = (selectedDate: Date) => {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set('date', format(selectedDate, 'yyyy-MM-dd'));
        router.push(`${pathname}?${newParams.toString()}`);
    };

    const handleNavigateDay = (days: number) => {
        const baseDate = date ?? new Date();
        const newDate = addDays(baseDate, days);

        setDate(newDate);
        updateURLWithDate(newDate);
    };

    const handdleDateSelect = (selectedDate: Date | undefined) => {
        if (selectedDate) {
            updateURLWithDate(selectedDate);
        }
        setIsPopoverOpen(false);
    };

    useEffect(() => {
        setDate(getInitialDate());
    }, [getInitialDate]);

    return (
        <div className="flex items-center gap-2">
            <NavigationButton
                tooltipText="Dia anterior"
                onClick={() => handleNavigateDay(-1)}
            >
                <ChevronLeft className="h-4 w-4" />
            </NavigationButton>

            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        className="w-min[180px] justify-between text-left font-normal bg-transparent border-border-primary text-content-primary hover:bg-background-tertiary hover:border-border-secondary hover:text-content-primary focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-border-brand focus:border-border-brand focus-visible:border-border-brand"
                    >
                        <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4 text-content-brand" />
                            {date ? (
                                format(date, 'dd/MM/yyyy', { locale: ptBR })
                            ) : (
                                <span>Selecione uma data</span>
                            )}
                        </div>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                    <Calendar
                        mode="single"
                        selected={date}
                        onSelect={handdleDateSelect}
                        autoFocus
                        locale={ptBR}
                    />
                </PopoverContent>
            </Popover>

            <NavigationButton
                tooltipText="Próximo dia"
                onClick={() => handleNavigateDay(1)}
            >
                <ChevronRight className="h-4 w-4" />
            </NavigationButton>
        </div>
    );
};
