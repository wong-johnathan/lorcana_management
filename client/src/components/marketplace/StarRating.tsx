import { useId } from "react";

interface StarRatingProps {
  /** The currently selected rating (0 = nothing selected yet). */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

const STARS = [1, 2, 3, 4, 5];

/**
 * Accessible 1–5 star control implemented as a native radio group
 * (`role="radiogroup"` + `aria-label`). Each option is a real
 * `<input type="radio">` labelled "1 star".."5 stars", so screen readers read
 * the labels and keyboard users can operate it with the arrow keys for free.
 * The filled star glyph vs the outline glyph (not colour alone) communicates
 * the current value.
 */
export default function StarRating({
  value,
  onChange,
  disabled = false,
}: StarRatingProps) {
  const groupName = useId();

  return (
    <div role="radiogroup" aria-label="Rating" className="flex items-center gap-1">
      {STARS.map((rating) => {
        const filled = rating <= value;
        return (
          <label
            key={rating}
            className={disabled ? "cursor-not-allowed" : "cursor-pointer"}
          >
            <input
              type="radio"
              name={groupName}
              value={rating}
              checked={value === rating}
              disabled={disabled}
              onChange={() => onChange(rating)}
              aria-label={`${rating} ${rating === 1 ? "star" : "stars"}`}
              className="sr-only"
            />
            <span
              aria-hidden="true"
              className={`text-xl leading-none ${
                filled ? "text-amber-400" : "text-gray-600"
              }`}
            >
              {filled ? "★" : "☆"}
            </span>
          </label>
        );
      })}
    </div>
  );
}
