interface ExtrasSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export default function ExtrasSearchInput({ value, onChange, placeholder = "Search cards..." }: ExtrasSearchInputProps) {
  return (
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label="Search extras"
      className="w-full rounded border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-amber-400 focus:outline-none"
    />
  );
}
