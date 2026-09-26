import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { useAsync } from '../../hooks/useAsync';
import { Button, ErrorState, Rating, Select, Textarea } from '../common/UI';
import DemoNotice from '../common/DemoNotice';

export default function ReviewForm({ productId, review, onDone }) {
  const { state, user, mutate } = useApp();
  const [rating, setRating] = useState(review?.rating || 5);
  const [comment, setComment] = useState(review?.comment || '');
  const [product, setProduct] = useState(productId || state.products[0]?.id || '');
  const { busy, error, run, setError } = useAsync();
  return (
    <form
      className="form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          if (!comment.trim()) {
            setError('Please write a comment.');
            return;
          }
          const result = await mutate(
            'reviews',
            review ? 'update' : 'create',
            review
              ? { rating, comment: comment.trim() }
              : {
                  userId: user.testId || 1,
                  productId:
                    state.products.find((p) => String(p.id) === String(product))?.testId || 1,
                  rating,
                  comment: comment.trim(),
                },
            review,
            {
              userId: user.id,
              productId:
                review?.productId ||
                state.products.find((p) => String(p.id) === String(product))?.id,
            },
          );
          if (result.ok) onDone?.();
          else setError(result.error);
        });
      }}
    >
      <DemoNotice compact />
      {!productId && !review && (
        <Select
          label="Product"
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          required
        >
          {state.products.map((p) => (
            <option value={p.id} key={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      )}
      <div>
        <label className="block text-sm mb-2">Your rating</label>
        <Rating value={rating} onChange={setRating} />
      </div>
      <Textarea
        label="Your review"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        required
        maxLength={2000}
        placeholder="What did you think of this piece?"
      />
      {error && <ErrorState message={error} />}
      <Button busy={busy} type="submit">
        {review ? 'Update review' : 'Submit review'}
      </Button>
    </form>
  );
}
