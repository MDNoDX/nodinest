-- Speech without a speaker's name is laid out again, with the people of the book.
UPDATE nodinest.book_pages SET formatted = NULL
WHERE jsonb_typeof(formatted) = 'array'
  AND formatted @? '$[*] ? (@.k == "d" && !exists(@.s))';
