"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getEventBySlug } from "@/lib/events";
import { cancelRsvp, createRsvp} from "@/lib/rsvps";
import { validateSlug } from "@/lib/slug";

async function resolve(slug: string) {
    if (!validateSlug (slug).ok) return null;
    const event = await getEventBySlug(slug);
    if (!event) return null;
    const user = await getCurrentUser();
    if (!user) redirect(`/login?returnTo=/e/${slug}`);
    return { event, user };
}

export async function rsvpAction(slug: string): Promise<void> {
    const ctx = await resolve(slug);
    if (!ctx) return;
    await createRsvp(ctx.event.id, ctx.user.id);
    revalidatePath(`/e/${slug}`);
}

export async function cancelAction(slug: string): Promise<void> {
    const ctx = await resolve(slug);
    if (!ctx) return;
    await cancelRsvp(ctx.event.id, ctx.user.id);
    revalidatePath(`/e/${slug}`);
}

