import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Eggs } from "./pages/Eggs";
import { Coop } from "./pages/Coop";
import { ChickenPage } from "./pages/Chicken";
import { Farm } from "./pages/Farm";
import { HatchPage } from "./pages/Hatch";
import { NotFound } from "./pages/NotFound";

export function App() {
  return (
    <Routes>
      <Route path="/hatch/:id" element={<HatchPage />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="eggs" element={<Eggs />} />
        <Route path="coop" element={<Coop />} />
        <Route path="chicken/:id" element={<ChickenPage />} />
        <Route path="farm" element={<Farm />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
