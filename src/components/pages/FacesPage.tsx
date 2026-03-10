import { useAppSelector } from '../../store'
import { selectPeople } from '../../store/people';
import PersonCard from '../people/PersonCard';
import { Masonry } from 'react-masonry'
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';


const cardWidth = 400;
const FacesPage = () => {
  const people = useAppSelector(selectPeople);
  const [searchParams] = useSearchParams();
  const q = (searchParams.get("q") || "").trim().toLowerCase();
  const filteredPeople = useMemo(() => {
    const all = Object.values(people);
    if (!q) return all;
    return all.filter((person) => person.name.toLowerCase().includes(q));
  }, [people, q]);
  return (
    <Masonry>
      {filteredPeople.map(person => (
        <div key={person.id} style={{ width: '25%', paddingBottom: '20px' }}>
          <PersonCard {...person} width={cardWidth} />
        </div>
      ))}
    </Masonry>
  )
}

export default FacesPage
