import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PublicProfilePanel from "../../components/profile/PublicProfilePanel";
import MarketplaceListingCard from "../../components/marketplace/MarketplaceListingCard";
import ReferenceForm from "../../components/marketplace/ReferenceForm";
import ReportModal from "../../components/marketplace/ReportModal";
import { marketplace } from "../../services/api";
import type { MarketplaceSellerProfile } from "../../types";
import { formatTimeAgo } from "../../utils/format";

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="text-amber-400" aria-label={`${rating} out of 5`}>
      {"★".repeat(rating)}
      <span className="text-gray-700">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default function MarketplaceSellerPage() {
  const { userId } = useParams<{ userId: string }>();
  const [data, setData] = useState<MarketplaceSellerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      setData(await marketplace.seller(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load seller profile");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
          Loading seller…
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="rounded-xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
          {error ?? "Seller not found"}
        </div>
      </div>
    );
  }

  const username = data.user?.username ?? "Seller";

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-amber-400">Seller profile</p>
          <h1 className="text-2xl font-bold text-gray-100">{username}</h1>
        </div>
        <ReportModal targetType="USER" targetId={data.user.id} label="Report user" />
      </div>

      <PublicProfilePanel profile={data.user.profile} username={username} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-100">Active listings</h2>
        {data.listings.length === 0 ? (
          <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-8 text-center text-sm text-gray-400">
            No active listings.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.listings.map((listing) => (
              <MarketplaceListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-100">Reviews</h2>
          {data.reviews.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
              No reviews yet.
            </div>
          ) : (
            data.reviews.map((review) => (
              <article key={review.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="flex items-center justify-between">
                  <Link
                    to={`/marketplace/seller/${review.reviewer.id}`}
                    className="text-sm font-semibold text-gray-100 hover:text-amber-300"
                  >
                    {review.reviewer.username}
                  </Link>
                  <span className="text-xs text-gray-500">{formatTimeAgo(review.createdAt)}</span>
                </div>
                <div className="mt-1">
                  <RatingStars rating={review.rating} />
                </div>
                {review.comment && <p className="mt-2 text-sm text-gray-300">{review.comment}</p>}
              </article>
            ))
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-gray-100">References</h2>
          {data.references.length === 0 ? (
            <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-6 text-center text-sm text-gray-400">
              No references yet.
            </div>
          ) : (
            data.references.map((reference) => (
              <article key={reference.id} className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-100">{reference.author.username}</span>
                  {reference.hasCompletedDeal && (
                    <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs font-medium text-emerald-300">
                      Completed deal
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-300">{reference.comment}</p>
                <p className="mt-2 text-xs text-gray-500">{formatTimeAgo(reference.createdAt)}</p>
              </article>
            ))
          )}

          <ReferenceForm subjectId={data.user.id} onSubmitted={load} />
        </section>
      </div>
    </div>
  );
}
