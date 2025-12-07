"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import {
  createAppointmentReviewAction,
  dismissAppointmentReviewModalAction,
} from "@/app/client/reviews/actions";

type ClientAppointmentReviewDialogProps = {
  defaultOpen?: boolean;
  appointment: {
    id: string;
    barberName: string;
    serviceName: string;
    scheduleAt: Date;
  };
  tags: {
    id: string;
    label: string;
  }[];
};

function formatAppointmentDateTime(date: Date): string {
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ClientAppointmentReviewDialog({
  defaultOpen,
  appointment,
  tags,
}: ClientAppointmentReviewDialogProps) {
  const [open, setOpen] = useState<boolean>(defaultOpen ?? false);
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  // garante que se o server mandar defaultOpen=true na primeira vez, o modal abre
  useEffect(() => {
    if (defaultOpen) {
      setOpen(true);
    }
  }, [defaultOpen]);

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) => {
      if (prev.includes(tagId)) {
        return prev.filter((id) => id !== tagId);
      }

      if (prev.length >= 3) {
        toast.info("Você pode selecionar no máximo 3 opções.");
        return prev;
      }

      return [...prev, tagId];
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!rating) {
      toast.error("Escolha uma nota para o atendimento.");
      return;
    }

    try {
      setSubmitting(true);

      const formData = new FormData();
      formData.append("appointmentId", appointment.id);
      formData.append("rating", String(rating));

      if (comment.trim()) {
        formData.append("comment", comment.trim());
      }

      selectedTagIds.forEach((id) => {
        formData.append("tagIds", id);
      });

      const result = await createAppointmentReviewAction(formData);

      if (!result.success) {
        toast.error(result.error || "Não foi possível salvar sua avaliação.");
        return;
      }

      toast.success("Obrigado pelo seu feedback! ✂️");
      setOpen(false);
    } catch (error) {
      console.error(
        "[ClientAppointmentReviewDialog] erro ao enviar review:",
        error,
      );
      toast.error("Erro ao salvar sua avaliação. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDismiss() {
    try {
      setDismissing(true);

      const result = await dismissAppointmentReviewModalAction(appointment.id);

      if (!result.success) {
        toast.error(
          result.error ||
            "Não foi possível fechar este lembrete agora. Tente novamente.",
        );
        return;
      }

      // marcamos como visto e fechamos o modal
      setOpen(false);
    } catch (error) {
      console.error(
        "[ClientAppointmentReviewDialog] erro ao dispensar modal:",
        error,
      );
      toast.error("Erro ao processar sua ação. Tente novamente.");
    } finally {
      setDismissing(false);
    }
  }

  const isBusy = submitting || dismissing;

  const displayDateTime = formatAppointmentDateTime(appointment.scheduleAt);

  const descriptionText = `Como foi seu atendimento de ${appointment.serviceName} com ${appointment.barberName} em ${displayDateTime}?`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* Trigger: botão discreto ao lado de "Meu perfil" */}
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-2 group rounded-full border border-border-primary px-3 py-1 text-paragraph-small-size text-content-secondary hover:text-content-primary hover:border-content-primary transition"
        >
          <Star className="h-4 w-4 fill-yellow-400/80 text-yellow-500 group-hover:scale-105 transition-transform" />
          <span>Avaliar atendimento</span>
        </button>
      </DialogTrigger>

      <DialogContent
        variant="appointment"
        overlayVariant="blurred"
        showCloseButton
      >
        <DialogHeader>
          <DialogTitle size="modal">Avaliar atendimento</DialogTitle>
          <DialogDescription size="modal">{descriptionText}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ⭐ Nota de 1 a 5 estrelas */}
          <div className="space-y-3">
            <p className="text-label-small-size text-content-primary flex items-center gap-1">
              Sua nota
              <span className="text-red-500">*</span>
            </p>
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }, (_, i) => {
                const starValue = i + 1;
                const isFilled =
                  hoverRating >= starValue ||
                  (!hoverRating && rating >= starValue);

                return (
                  <button
                    key={starValue}
                    type="button"
                    onClick={() => setRating(starValue)}
                    onMouseEnter={() => setHoverRating(starValue)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1"
                    disabled={isBusy}
                  >
                    <Star
                      className={`h-7 w-7 transition-transform ${
                        isFilled
                          ? "fill-yellow-400 text-yellow-500"
                          : "text-border-primary"
                      }`}
                    />
                  </button>
                );
              })}
              {rating > 0 && (
                <span className="ml-2 text-paragraph-small-size text-content-secondary">
                  {rating} de 5
                </span>
              )}
            </div>
          </div>

          {/* 🧩 Tooltips / Tags */}
          {tags.length > 0 && (
            <div className="space-y-3">
              <p className="text-label-small-size text-content-primary">
                O que mais se destaca nesse atendimento?{" "}
                <span className="text-content-tertiary">(até 3)</span>
              </p>

              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={`rounded-full border px-3 py-1 text-paragraph-small-size transition ${
                        isSelected
                          ? "border-brand-primary bg-brand-primary text-white"
                          : "border-border-primary bg-background-tertiary text-content-secondary hover:border-content-primary hover:text-content-primary"
                      }`}
                      disabled={isBusy}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 💬 Comentário opcional */}
          <div className="space-y-2">
            <label
              htmlFor="review-comment"
              className="text-label-small-size text-content-primary flex items-center gap-1"
            >
              Comentário (opcional)
              <MessageCircle className="h-4 w-4 text-border-primary" />
            </label>
            <Textarea
              id="review-comment"
              placeholder="Conte mais sobre como foi sua experiência..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isBusy}
              className="bg-background-tertiary border-border-primary text-content-primary placeholder:text-content-tertiary resize-none min-h-24"
            />
          </div>

          {/* Ações */}
          <div className="flex justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={isBusy}
              onClick={handleDismiss}
            >
              {dismissing ? "Fechando..." : "Agora não"}
            </Button>

            <Button type="submit" variant="brand" disabled={isBusy}>
              {submitting ? "Enviando..." : "Enviar avaliação"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
